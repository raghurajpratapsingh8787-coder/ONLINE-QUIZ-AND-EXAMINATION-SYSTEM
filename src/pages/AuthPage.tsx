import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'motion/react';
import { Eye, EyeOff, KeyRound, Lock, Mail, Moon, Shield, Sun, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../components/ui/Toast';
import { apiRequest, ApiError } from '../lib/api';

const loginFormSchema = z.object({
  email: z.string().email('Enter a valid institutional email'),
  password: z.string().min(1, 'Password is required'),
});

const registerFormSchema = z.object({
  name: z.string().min(2, 'Full name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Minimum 8 characters')
    .regex(/[A-Z]/, 'Include at least 1 uppercase letter')
    .regex(/[0-9]/, 'Include at least 1 number'),
  department: z.string().optional(),
  group: z.string().optional(),
  rollNumber: z.string().optional(),
});

const resetFormSchema = z.object({
  token: z.string().min(10, 'Enter the reset token'),
  newPassword: z
    .string()
    .min(8, 'Minimum 8 characters')
    .regex(/[A-Z]/, 'Include at least 1 uppercase letter')
    .regex(/[0-9]/, 'Include at least 1 number'),
});

type Mode = 'login' | 'register' | 'reset';

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    name: 'Raghuraj Pratap Singh',
    email: 'raghurajpratapsingh8787@gmail.com',
    password: 'Admin@ExamVault2026',
  },
  {
    role: 'Teacher',
    name: 'Dr. Meera Deshmukh',
    email: 'teacher@examvault.edu',
    password: 'Teacher@ExamVault2026',
  },
  {
    role: 'Student',
    name: 'Aarav Patel',
    email: 'student@examvault.edu',
    password: 'Student@ExamVault2026',
  },
];

export function AuthPage() {
  const { login, register: registerAccount } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetNotice, setResetNotice] = useState('');

  const loginForm = useForm<z.infer<typeof loginFormSchema>>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      department: 'Computer Science & Engineering',
      group: 'CS-2026',
      rollNumber: '',
    },
  });

  const resetForm = useForm<z.infer<typeof resetFormSchema>>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token: '', newPassword: '' },
  });

  const onLoginSubmit = async (values: z.infer<typeof loginFormSchema>) => {
    setSubmitting(true);
    setServerError('');
    try {
      const signedIn = await login(values.email, values.password);
      notify('success', `Welcome back, ${signedIn.name}`, `Signed in as ${signedIn.role}.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const onRegisterSubmit = async (values: z.infer<typeof registerFormSchema>) => {
    setSubmitting(true);
    setServerError('');
    try {
      const created = await registerAccount(values);
      notify('success', 'Account created', `Welcome to ExamVault, ${created.name}.`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const onRequestResetToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setServerError('');
    setResetNotice('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail }),
        skipAuthRefresh: true,
      });
      setResetNotice(res.message);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Failed to request reset token.');
    } finally {
      setSubmitting(false);
    }
  };

  const onConfirmReset = async (values: z.infer<typeof resetFormSchema>) => {
    setSubmitting(true);
    setServerError('');
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(values),
        skipAuthRefresh: true,
      });
      notify('success', 'Password updated', res.message);
      setMode('login');
      resetForm.reset();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Failed to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (email: string, password: string) => {
    setMode('login');
    setServerError('');
    loginForm.setValue('email', email, { shouldValidate: true });
    loginForm.setValue('password', password, { shouldValidate: true });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-slate-50 dark:bg-[#0B1020]">
      {/* Left Architectural Panel */}
      <div className="relative hidden lg:flex lg:col-span-5 xl:col-span-6 flex-col justify-between overflow-hidden bg-[#0A1128] p-10 xl:p-14 text-white">
        <img
          src="/src/assets/images/examvault_campus_hero_1795710250612.jpg"
          alt="University library atrium at dusk"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070C1C] via-[#0B1430]/75 to-[#0B1430]/40" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 text-white font-bold text-sm flex items-center justify-center">
            EV
          </div>
          <span className="font-bold text-lg tracking-tight">ExamVault</span>
        </div>

        <div className="relative z-10 max-w-lg space-y-6">
          <h1 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight text-white">
            Academic assessment engineered for fairness, clarity, and scale.
          </h1>
          <p className="text-sm xl:text-base text-slate-200 leading-relaxed">
            Server-verified exam windows, automatic objective grading, structured subjective faculty
            evaluation, and live institutional analytics in one security-first platform.
          </p>

          <div className="grid grid-cols-3 gap-6 pt-4 border-t border-white/15">
            <div>
              <p className="font-mono tabular-nums text-xl font-semibold text-white">RBAC</p>
              <p className="mt-1 text-xs text-slate-300">Admin, Teacher &amp; Student scopes</p>
            </div>
            <div>
              <p className="font-mono tabular-nums text-xl font-semibold text-white">Auto-Save</p>
              <p className="mt-1 text-xs text-slate-300">Crash-safe timed examination sync</p>
            </div>
            <div>
              <p className="font-mono tabular-nums text-xl font-semibold text-white">Audit Trail</p>
              <p className="mt-1 text-xs text-slate-300">Server deadlines &amp; submission locks</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between text-xs text-slate-300 border-t border-white/15 pt-4">
          <span>Platform Lead: Raghuraj Pratap Singh</span>
          <span>raghurajpratapsingh8787@gmail.com</span>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="lg:col-span-7 xl:col-span-6 flex flex-col justify-between px-5 sm:px-10 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              EV
            </div>
            <span className="font-bold text-base text-slate-900 dark:text-white">ExamVault</span>
          </div>
          <div className="ml-auto">
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md mx-auto my-8"
        >
          {/* Mode Segmented Switcher */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 mb-7"
          >
            {(
              [
                { id: 'login', label: 'Sign In' },
                { id: 'register', label: 'Register' },
                { id: 'reset', label: 'Reset Key' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => {
                  setMode(tab.id);
                  setServerError('');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === tab.id
                    ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {serverError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
            >
              {serverError}
            </div>
          )}

          {mode === 'login' && (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Sign in to ExamVault</h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Enter your institutional credentials to access your role dashboard.
              </p>

              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@examvault.edu"
                      {...loginForm.register('email')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  {loginForm.formState.errors.email && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {loginForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      {...loginForm.register('password')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] pl-10 pr-10 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {loginForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-4 transition-colors disabled:opacity-60"
                >
                  {submitting ? 'Verifying credentials…' : 'Sign In'}
                </button>
              </form>

              {/* Quick Demo Account Selector */}
              <div className="mt-7 pt-6 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  Seeded Demo Accounts (click to populate)
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      onClick={() => fillDemo(acc.email, acc.password)}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] px-3.5 py-2.5 text-left hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {acc.role} · {acc.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          {acc.email}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0">
                        Use
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create a student account</h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Self-registration creates a student account. Faculty and administrator roles are provisioned by platform admins.
              </p>

              <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    placeholder="e.g., Priya Sharma"
                    {...registerForm.register('name')}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {registerForm.formState.errors.name && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {registerForm.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Institutional Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    placeholder="you@university.edu"
                    {...registerForm.register('email')}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {registerForm.formState.errors.email && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {registerForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-group" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Class / Group
                    </label>
                    <select
                      id="reg-group"
                      {...registerForm.register('group')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="CS-2026">CS-2026</option>
                      <option value="EE-2026">EE-2026</option>
                      <option value="ME-2026">ME-2026</option>
                      <option value="DS-2026">DS-2026</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-roll" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Roll Number (optional)
                    </label>
                    <input
                      id="reg-roll"
                      type="text"
                      placeholder="e.g., CS26-042"
                      {...registerForm.register('rollNumber')}
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password (min 8 chars, 1 uppercase, 1 number)
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    placeholder="Create a strong password"
                    {...registerForm.register('password')}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {registerForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                      {registerForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-4 transition-colors disabled:opacity-60"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>{submitting ? 'Creating account…' : 'Create Account'}</span>
                </button>
              </form>
            </div>
          )}

          {mode === 'reset' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Password Recovery</h2>
                <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Request a single-use expiring reset token and choose a new password.
                </p>
              </div>

              <form onSubmit={onRequestResetToken} className="space-y-3">
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step 1: Request Reset Token
                </label>
                <div className="flex gap-2">
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="Enter your account email"
                    className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 whitespace-nowrap shrink-0"
                  >
                    Send Token
                  </button>
                </div>
                {resetNotice && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">{resetNotice}</p>
                )}
              </form>

              <form
                onSubmit={resetForm.handleSubmit(onConfirmReset)}
                className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800"
              >
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Step 2: Apply Token &amp; New Password
                </p>
                <div>
                  <label htmlFor="reset-token" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Reset Token
                  </label>
                  <input
                    id="reset-token"
                    type="text"
                    {...resetForm.register('token')}
                    placeholder="Paste single-use token"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label htmlFor="reset-new-pw" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    New Password
                  </label>
                  <input
                    id="reset-new-pw"
                    type="password"
                    {...resetForm.register('newPassword')}
                    placeholder="New strong password"
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#11182D] px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm py-2.5 px-4"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>Reset Password</span>
                </button>
              </form>
            </div>
          )}
        </motion.div>

        <div className="text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
          <Shield className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Protected by HttpOnly JWT cookies, CSRF verification &amp; bcrypt hashing</span>
        </div>
      </div>
    </div>
  );
}

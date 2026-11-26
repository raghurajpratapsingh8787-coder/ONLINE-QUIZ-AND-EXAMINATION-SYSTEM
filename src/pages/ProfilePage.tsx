import React, { useState } from 'react';
import { KeyRound, Save, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { apiRequest, ApiError, setMemoryAccessToken } from '../lib/api';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { notify } = useToast();

  const [name, setName] = useState(user?.name || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [group, setGroup] = useState(user?.group || '');
  const [rollNumber, setRollNumber] = useState(user?.rollNumber || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiRequest('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, department, group, rollNumber, bio }),
      });
      await refreshUser();
      notify('success', 'Profile updated');
    } catch (err) {
      notify('error', 'Failed to update profile', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      const res = await apiRequest<{ message: string; accessToken?: string }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword }),
        }
      );
      if (res.accessToken) setMemoryAccessToken(res.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      notify('success', 'Password changed', 'Previous sessions have been revoked for security.');
    } catch (err) {
      notify('error', 'Password update failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Profile &amp; Security</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage your institutional identity and account password.
        </p>
      </div>

      {/* Account Summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 flex items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-indigo-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
          {user.name
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{user.name}</h3>
          <p className="text-sm text-slate-500 font-mono truncate">{user.email}</p>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold capitalize mt-0.5">
            {user.role} Account · Status: {user.accountStatus}
          </p>
        </div>
      </div>

      {/* Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <UserIcon className="h-4 w-4 text-indigo-500" />
          <span>Personal Information</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="prof-name" className="block text-xs font-semibold mb-1">
              Full Name
            </label>
            <input
              id="prof-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="prof-dept" className="block text-xs font-semibold mb-1">
              Department
            </label>
            <input
              id="prof-dept"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
            />
          </div>
          {user.role === 'student' && (
            <>
              <div>
                <label htmlFor="prof-group" className="block text-xs font-semibold mb-1">
                  Cohort / Group
                </label>
                <input
                  id="prof-group"
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="prof-roll" className="block text-xs font-semibold mb-1">
                  Roll Number
                </label>
                <input
                  id="prof-roll"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono"
                />
              </div>
            </>
          )}
        </div>

        <div>
          <label htmlFor="prof-bio" className="block text-xs font-semibold mb-1">
            Bio
          </label>
          <textarea
            id="prof-bio"
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2"
          >
            <Save className="h-4 w-4" />
            <span>{savingProfile ? 'Saving…' : 'Save Profile'}</span>
          </button>
        </div>
      </form>

      {/* Password Update */}
      <form
        onSubmit={handleChangePassword}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 space-y-4"
      >
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <KeyRound className="h-4 w-4 text-indigo-500" />
          <span>Change Password</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pw-curr" className="block text-xs font-semibold mb-1">
              Current Password
            </label>
            <input
              id="pw-curr"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="pw-new" className="block text-xs font-semibold mb-1">
              New Password (8+ chars, 1 uppercase, 1 number)
            </label>
            <input
              id="pw-new"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPw}
            className="rounded-lg bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2"
          >
            {savingPw ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

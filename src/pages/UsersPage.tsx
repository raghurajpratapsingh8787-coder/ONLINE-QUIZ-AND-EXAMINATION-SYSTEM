import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Search, ShieldCheck, Trash2, UserCheck, UserX, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState, TableSkeleton } from '../components/ui/Skeleton';
import { apiRequest, ApiError } from '../lib/api';
import type { AccountStatus, User, UserRole } from '../types';

export function UsersPage({ defaultRole }: { defaultRole: 'student' | 'teacher' }) {
  const { user: currentUser, settings } = useAuth();
  const { notify } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleTab, setRoleTab] = useState<'all' | UserRole>(defaultRole);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: defaultRole as UserRole,
    department: 'Computer Science & Engineering',
    group: 'CS-2026',
    rollNumber: '',
  });

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setRoleTab(defaultRole);
    setNewUser((prev) => ({ ...prev, role: defaultRole }));
  }, [defaultRole]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (roleTab !== 'all') qs.set('role', roleTab);
      if (search) qs.set('search', search);
      const res = await apiRequest<{ users: User[] }>(`/api/users?${qs.toString()}`);
      setUsers(res.users);
    } catch (err) {
      notify('error', 'Failed to load accounts', err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [roleTab, search, notify]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...newUser, accountStatus: 'active' }),
      });
      notify('success', 'User account created');
      setModalOpen(false);
      setNewUser({
        name: '',
        email: '',
        password: '',
        role: defaultRole,
        department: 'Computer Science & Engineering',
        group: 'CS-2026',
        rollNumber: '',
      });
      await fetchUsers();
    } catch (err) {
      notify('error', 'Could not create user', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (target: User) => {
    const nextStatus: AccountStatus = target.accountStatus === 'active' ? 'inactive' : 'active';
    try {
      await apiRequest(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      notify('success', `Account ${nextStatus === 'active' ? 'activated' : 'deactivated'}`);
      await fetchUsers();
    } catch (err) {
      notify('error', 'Status update failed', err instanceof ApiError ? err.message : undefined);
    }
  };

  const handleRoleChange = async (target: User, role: UserRole) => {
    try {
      await apiRequest(`/api/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      notify('success', `Role updated to ${role}`);
      await fetchUsers();
    } catch (err) {
      notify('error', 'Role update failed', err instanceof ApiError ? err.message : undefined);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/users/${deleteTarget.id}`, { method: 'DELETE' });
      notify('success', 'Account permanently deleted');
      setDeleteTarget(null);
      await fetchUsers();
    } catch (err) {
      notify('error', 'Delete failed', err instanceof ApiError ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const groups = settings?.studentGroups || ['CS-2026', 'EE-2026', 'ME-2026', 'DS-2026'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {roleTab === 'teacher' ? 'Faculty & Teachers' : roleTab === 'student' ? 'Student Directory' : 'All Users'}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Provision accounts, assign platform roles, and activate or deactivate user access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add User</span>
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, roll number, or group…"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
          {(['student', 'teacher', 'admin', 'all'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleTab(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize whitespace-nowrap ${
                roleTab === r
                  ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {r === 'all' ? 'All Roles' : `${r}s`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No accounts match this filter"
          description="Add a new account or adjust your search query."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3.5 font-medium">User</th>
                <th className="px-5 py-3.5 font-medium">Department / Cohort</th>
                <th className="px-5 py-3.5 font-medium">Role</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
                <th className="px-5 py-3.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {u.name} {isSelf ? '(You)' : ''}
                      </p>
                      <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                      <p>{u.department || '—'}</p>
                      {(u.group || u.rollNumber) && (
                        <p className="font-mono text-slate-500">
                          {[u.group, u.rollNumber].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <select
                        aria-label={`Role for ${u.name}`}
                        disabled={isSelf}
                        value={u.role}
                        onChange={(e) => void handleRoleChange(u, e.target.value as UserRole)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1 text-xs font-semibold capitalize disabled:opacity-50"
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-5 py-3.5 text-xs font-semibold">
                      <span
                        className={
                          u.accountStatus === 'active'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {u.accountStatus === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        disabled={isSelf}
                        aria-label={
                          u.accountStatus === 'active'
                            ? `Deactivate ${u.name}`
                            : `Activate ${u.name}`
                        }
                        onClick={() => void handleToggleStatus(u)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                      >
                        {u.accountStatus === 'active' ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4 text-emerald-500" />
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={isSelf}
                        aria-label={`Delete ${u.name}`}
                        onClick={() => setDeleteTarget(u)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Provision New Account
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setModalOpen(false)}
                  className="p-1 text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="mt-4 space-y-3.5">
                <div>
                  <label htmlFor="nu-name" className="block text-xs font-semibold mb-1">
                    Full Name
                  </label>
                  <input
                    id="nu-name"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="nu-email" className="block text-xs font-semibold mb-1">
                    Email Address
                  </label>
                  <input
                    id="nu-email"
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="nu-pw" className="block text-xs font-semibold mb-1">
                    Temporary Password (min 8 chars)
                  </label>
                  <input
                    id="nu-pw"
                    type="password"
                    minLength={8}
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="nu-role" className="block text-xs font-semibold mb-1">
                      Role
                    </label>
                    <select
                      id="nu-role"
                      value={newUser.role}
                      onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value as UserRole }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="nu-group" className="block text-xs font-semibold mb-1">
                      Group / Cohort
                    </label>
                    <select
                      id="nu-group"
                      value={newUser.group}
                      onChange={(e) => setNewUser((p) => ({ ...p, group: e.target.value }))}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
                    >
                      {groups.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="pt-3 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2"
                  >
                    {saving ? 'Creating…' : 'Create User'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user account?"
        description={`This will permanently remove ${deleteTarget?.name} (${deleteTarget?.email}) and revoke their active sessions.`}
        confirmLabel="Delete Account"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

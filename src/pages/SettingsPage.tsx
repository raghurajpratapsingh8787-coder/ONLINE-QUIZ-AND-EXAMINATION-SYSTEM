import React, { useEffect, useState } from 'react';
import { Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { apiRequest, ApiError } from '../lib/api';
import type { AuditLogItem, IncidentReport, PlatformSettings } from '../types';

export function SettingsPage() {
  const { settings, refreshSettings } = useAuth();
  const { notify } = useToast();

  const [activeTab, setActiveTab] = useState<'general' | 'incidents' | 'audit'>('general');
  const [form, setForm] = useState<PlatformSettings | null>(settings);
  const [subjectsText, setSubjectsText] = useState('');
  const [categoriesText, setCategoriesText] = useState('');
  const [groupsText, setGroupsText] = useState('');
  const [saving, setSaving] = useState(false);

  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  useEffect(() => {
    if (settings) {
      setForm(settings);
      setSubjectsText(settings.subjects.join(', '));
      setCategoriesText(settings.categories.join(', '));
      setGroupsText(settings.studentGroups.join(', '));
    }
  }, [settings]);

  useEffect(() => {
    apiRequest<{ incidents: IncidentReport[] }>('/api/platform/incidents')
      .then((r) => setIncidents(r.incidents))
      .catch(() => {});
    apiRequest<{ logs: AuditLogItem[] }>('/api/platform/audit-logs')
      .then((r) => setAuditLogs(r.logs))
      .catch(() => {});
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const splitList = (raw: string) =>
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

      await apiRequest('/api/platform/settings', {
        method: 'PUT',
        body: JSON.stringify({
          institutionName: form.institutionName,
          supportEmail: form.supportEmail,
          ownerName: form.ownerName,
          ownerEmail: form.ownerEmail,
          allowSelfRegistration: form.allowSelfRegistration,
          defaultExamDuration: Number(form.defaultExamDuration),
          subjects: splitList(subjectsText),
          categories: splitList(categoriesText),
          studentGroups: splitList(groupsText),
          emailNotificationsEnabled: form.emailNotificationsEnabled,
          tabSwitchWarningThreshold: Number(form.tabSwitchWarningThreshold),
        }),
      });
      await refreshSettings();
      notify('success', 'Platform settings updated');
    } catch (err) {
      notify('error', 'Failed to update settings', err instanceof ApiError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleIncidentStatus = async (id: string, status: IncidentReport['status']) => {
    try {
      await apiRequest(`/api/platform/incidents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      notify('success', `Incident marked as ${status}`);
    } catch (err) {
      notify('error', 'Update failed', err instanceof ApiError ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Platform Settings &amp; Governance
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage institutional configuration, academic subjects &amp; cohorts, reported incidents, and security audit logs.
        </p>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
        {(
          [
            ['general', 'Configuration & Taxonomy'],
            ['incidents', `Incidents (${incidents.filter((i) => i.status !== 'resolved').length})`],
            ['audit', 'Security Audit Logs'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
              activeTab === id
                ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && form && (
        <form
          onSubmit={handleSaveSettings}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] p-6 space-y-5 max-w-3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="st-inst" className="block text-xs font-semibold mb-1">
                Institution Name
              </label>
              <input
                id="st-inst"
                required
                value={form.institutionName}
                onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="st-support" className="block text-xs font-semibold mb-1">
                Support Email
              </label>
              <input
                id="st-support"
                type="email"
                required
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="st-owner" className="block text-xs font-semibold mb-1">
                Platform Administrator Name
              </label>
              <input
                id="st-owner"
                required
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="st-owner-email" className="block text-xs font-semibold mb-1">
                Platform Administrator Email
              </label>
              <input
                id="st-owner-email"
                type="email"
                required
                value={form.ownerEmail}
                onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="st-subj" className="block text-xs font-semibold mb-1">
              Academic Subjects (comma-separated)
            </label>
            <input
              id="st-subj"
              required
              value={subjectsText}
              onChange={(e) => setSubjectsText(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="st-cats" className="block text-xs font-semibold mb-1">
                Exam Categories (comma-separated)
              </label>
              <input
                id="st-cats"
                required
                value={categoriesText}
                onChange={(e) => setCategoriesText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="st-groups" className="block text-xs font-semibold mb-1">
                Student Cohorts / Groups (comma-separated)
              </label>
              <input
                id="st-groups"
                required
                value={groupsText}
                onChange={(e) => setGroupsText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="st-dur" className="block text-xs font-semibold mb-1">
                Default Exam Duration (minutes)
              </label>
              <input
                id="st-dur"
                type="number"
                min={5}
                max={360}
                value={form.defaultExamDuration}
                onChange={(e) => setForm({ ...form, defaultExamDuration: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="st-tab" className="block text-xs font-semibold mb-1">
                Tab-Switch Advisory Threshold
              </label>
              <input
                id="st-tab"
                type="number"
                min={1}
                max={20}
                value={form.tabSwitchWarningThreshold}
                onChange={(e) =>
                  setForm({ ...form, tabSwitchWarningThreshold: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.allowSelfRegistration}
                onChange={(e) => setForm({ ...form, allowSelfRegistration: e.target.checked })}
                className="h-4 w-4 accent-indigo-600"
              />
              <span>Allow student &amp; faculty self-registration</span>
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.emailNotificationsEnabled}
                onChange={(e) => setForm({ ...form, emailNotificationsEnabled: e.target.checked })}
                className="h-4 w-4 accent-indigo-600"
              />
              <span>Dispatch SMTP email notifications via Nodemailer (when configured on server)</span>
            </label>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Saving…' : 'Save Platform Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {activeTab === 'incidents' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] divide-y divide-slate-200 dark:divide-slate-800">
          {incidents.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">No reported incidents.</p>
          ) : (
            incidents.map((inc) => (
              <div key={inc.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                    <span className="capitalize font-semibold">{inc.severity} severity</span>
                    <span>·</span>
                    <span>{inc.examTitle || 'Platform'}</span>
                    {inc.studentName && (
                      <>
                        <span>·</span>
                        <span>Student: {inc.studentName}</span>
                      </>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{inc.title}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{inc.description}</p>
                </div>
                <select
                  aria-label={`Status for ${inc.title}`}
                  value={inc.status}
                  onChange={(e) =>
                    void handleIncidentStatus(inc.id, e.target.value as IncidentReport['status'])
                  }
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B1020] px-3 py-1.5 text-xs font-semibold capitalize shrink-0"
                >
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Actor</th>
                <th className="px-5 py-3 font-medium">Resource</th>
                <th className="px-5 py-3 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-5 py-3 font-mono font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    <span>{log.action}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600 dark:text-slate-400">
                    {log.actorEmail} ({log.actorRole})
                  </td>
                  <td className="px-5 py-3 font-mono text-slate-500">
                    {log.resourceType}:{log.resourceId}
                  </td>
                  <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

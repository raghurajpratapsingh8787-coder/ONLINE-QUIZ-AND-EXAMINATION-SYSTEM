import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { EmptyState } from '../components/ui/Skeleton';

export function NotificationsPage() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const visible =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Notification Center</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Live examination announcements, grading updates, and account security alerts.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllNotificationsRead()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#11182D] hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            <CheckCheck className="h-4 w-4 text-indigo-500" />
            <span>Mark All as Read ({unreadCount})</span>
          </button>
        )}
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
        {(['all', 'unread'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize ${
              filter === tab
                ? 'bg-white dark:bg-[#11182D] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab === 'unread' ? `Unread (${unreadCount})` : `All (${notifications.length})`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Bell className="h-6 w-6" />}
          title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
          description="Real-time updates about scheduled exams and published scores will arrive here automatically."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11182D] divide-y divide-slate-200 dark:divide-slate-800">
          {visible.map((n) => (
            <div
              key={n.id}
              className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                !n.read ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="capitalize">{n.type.replace(/_/g, ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                  {!n.read && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        Unread
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                  {n.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{n.message}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {n.link && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read) void markNotificationRead(n.id);
                      navigate(n.link!);
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Open
                  </button>
                )}
                {!n.read && (
                  <button
                    type="button"
                    aria-label={`Mark "${n.title}" as read`}
                    onClick={() => void markNotificationRead(n.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 text-xs font-semibold"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Mark Read</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

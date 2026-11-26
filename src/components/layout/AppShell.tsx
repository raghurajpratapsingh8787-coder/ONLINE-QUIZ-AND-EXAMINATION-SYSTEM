import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  ShieldCheck,
  Sun,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import type { UserRole } from '../../types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge?: number;
}

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/exams': 'Examinations',
  '/questions': 'Question Bank',
  '/submissions': 'Submissions & Grading',
  '/results': 'Results',
  '/students': 'Students',
  '/teachers': 'Teachers',
  '/analytics': 'Platform Analytics',
  '/notifications': 'Notifications',
  '/settings': 'Platform Settings',
  '/profile': 'Profile & Security',
};

export function AppShell() {
  const { user, unreadCount, logout, settings } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const allNavItems: NavItem[] = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'teacher', 'student'] },
    { to: '/exams', label: 'Exams', icon: FileSpreadsheet, roles: ['admin', 'teacher', 'student'] },
    { to: '/questions', label: 'Question Bank', icon: BookOpen, roles: ['admin', 'teacher'] },
    { to: '/submissions', label: 'Evaluations', icon: ClipboardCheck, roles: ['admin', 'teacher'] },
    {
      to: '/results',
      label: user.role === 'student' ? 'My Results' : 'Results',
      icon: GraduationCap,
      roles: ['admin', 'teacher', 'student'],
    },
    { to: '/students', label: 'Students', icon: Users, roles: ['admin'] },
    { to: '/teachers', label: 'Teachers', icon: ShieldCheck, roles: ['admin'] },
    { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['admin', 'teacher'] },
    {
      to: '/notifications',
      label: 'Notifications',
      icon: Bell,
      roles: ['admin', 'teacher', 'student'],
      badge: unreadCount,
    },
    { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
    { to: '/profile', label: 'Profile', icon: UserIcon, roles: ['admin', 'teacher', 'student'] },
  ];
  const navItems = allNavItems.filter((item) => item.roles.includes(user.role));

  const currentTitle = ROUTE_TITLES[location.pathname] || 'ExamVault';

  const handleLogout = async () => {
    await logout();
    navigate('/auth', { replace: true });
  };

  const renderSidebarLinks = (isMobile = false) => (
    <nav aria-label="Primary navigation" className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => isMobile && setMobileOpen(false)}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {(!collapsed || isMobile) && (
              <span className="flex-1 truncate">{item.label}</span>
            )}
            {(!collapsed || isMobile) && item.badge && item.badge > 0 ? (
              <span className="font-mono tabular-nums text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-current">
                {item.badge}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1020] text-slate-900 dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 76 : 252 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="hidden lg:flex flex-col shrink-0 border-r border-slate-200 dark:border-slate-800/90 bg-white dark:bg-[#0F1629] sticky top-0 h-screen z-20"
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800/90">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2.5 text-left min-w-0"
          >
            <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              EV
            </div>
            {!collapsed && (
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap truncate">
                ExamVault
              </span>
            )}
          </button>
          <button
            type="button"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {renderSidebarLinks(false)}

        <div className="border-t border-slate-200 dark:border-slate-800/90 p-3">
          {!collapsed && (
            <div className="px-3 py-2 mb-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate capitalize">
                {user.role} {user.group ? `· ${user.group}` : ''}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors whitespace-nowrap"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-slate-950/60"
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-10 w-64 max-w-[82vw] flex flex-col bg-white dark:bg-[#0F1629] border-r border-slate-200 dark:border-slate-800 h-full"
            >
              <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-base text-slate-900 dark:text-white">ExamVault</span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileOpen(false)}
                  className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {renderSidebarLinks(true)}
              <div className="border-t border-slate-200 dark:border-slate-800 p-3">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Contextual Top Bar */}
        <header className="h-16 sticky top-0 z-10 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800/90 bg-white/90 dark:bg-[#0B1020]/90 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {settings?.institutionName || 'ExamVault Academic Portal'}
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={toggleTheme}
              className="rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              aria-label={`Notifications (${unreadCount} unread)`}
              onClick={() => navigate('/notifications')}
              className="relative rounded-lg p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="hidden sm:flex items-center gap-2.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0"
            >
              <span className="h-6 w-6 rounded-md bg-indigo-600/15 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">
                {user.name
                  .split(' ')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">{user.name}</span>
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>

        {/* Quiet Institutional Attribution Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-800/80 px-4 sm:px-6 lg:px-8 py-4 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <span>
            ExamVault Online Quiz &amp; Examination System · Administered by{' '}
            <strong className="font-medium text-slate-700 dark:text-slate-300">
              {settings?.ownerName || 'Raghuraj Pratap Singh'}
            </strong>
          </span>
          <a
            href={`mailto:${settings?.ownerEmail || 'raghurajpratapsingh8787@gmail.com'}`}
            className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {settings?.ownerEmail || 'raghurajpratapsingh8787@gmail.com'}
          </a>
        </footer>
      </div>
    </div>
  );
}

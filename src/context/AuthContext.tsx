import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { apiRequest, getMemoryAccessToken, setMemoryAccessToken } from '../lib/api';
import type { NotificationItem, PlatformSettings, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  settings: PlatformSettings | null;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    department?: string;
    group?: string;
    rollNumber?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const data = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
      setNotifications(data.notifications);
    } catch {
      // ignore if signed out
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const data = await apiRequest<{ settings: PlatformSettings }>('/api/platform/settings');
      setSettings(data.settings);
    } catch {
      // ignore if signed out
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
      setMemoryAccessToken(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiRequest<{ authenticated: boolean; user: User | null }>('/api/auth/session', {
          skipAuthRefresh: true,
        });
        if (active) setUser(data.authenticated ? data.user : null);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Connect Socket.IO for live notifications whenever user is authenticated
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setNotifications([]);
      return;
    }

    void refreshNotifications();
    void refreshSettings();

    const socket = io({
      path: '/socket.io',
      withCredentials: true,
      auth: { token: getMemoryAccessToken() || undefined },
      transports: ['websocket', 'polling'],
    });

    socket.on('notification:new', (notif: NotificationItem) => {
      setNotifications((prev) => {
        if (prev.some((n) => n.id === notif.id)) return prev;
        return [notif, ...prev];
      });
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, refreshNotifications, refreshSettings]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest<{ user: User; accessToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuthRefresh: true,
    });
    setMemoryAccessToken(res.accessToken);
    setUser(res.user);
    return res.user;
  };

  const register = async (payload: {
    name: string;
    email: string;
    password: string;
    department?: string;
    group?: string;
    rollNumber?: string;
  }) => {
    const res = await apiRequest<{ user: User; accessToken: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuthRefresh: true,
    });
    setMemoryAccessToken(res.accessToken);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', skipAuthRefresh: true });
    } catch {
      // continue local cleanup
    }
    setMemoryAccessToken(null);
    setUser(null);
    setNotifications([]);
    socketRef.current?.disconnect();
    socketRef.current = null;
  };

  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    } catch {
      void refreshNotifications();
    }
  };

  const markAllNotificationsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiRequest('/api/notifications/mark-all-read', { method: 'POST' });
    } catch {
      void refreshNotifications();
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        settings,
        login,
        register,
        logout,
        refreshUser,
        refreshNotifications,
        refreshSettings,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

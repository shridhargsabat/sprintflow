import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { api, TOKEN_KEY, setAuthExpiredHandler } from '../api';
import type { AuthUser, Role } from '../api';

export type { Role };
export type SessionUser = AuthUser;

export interface AuthContextValue {
  user: SessionUser | null;
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: (reason?: string) => void;
  loading: boolean;
  /** Set when the session ends unexpectedly (e.g. "Session expired"). */
  reason: string | null;
  clearReason: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reason, setReason] = useState<string | null>(null);

  const logout = useCallback((logoutReason?: string): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
    setUser(null);
    setPermissions([]);
    if (logoutReason) setReason(logoutReason);
  }, []);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // Any 401 from the API client ends the session with a "Session expired" reason.
  useEffect(() => {
    setAuthExpiredHandler(() => logoutRef.current('Session expired'));
    return () => setAuthExpiredHandler(null);
  }, []);

  // Restore session on mount.
  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      let token: string | null = null;
      try {
        token = localStorage.getItem(TOKEN_KEY);
      } catch {
        token = null;
      }
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        if (cancelled) return;
        setUser({ id: me.id, email: me.email, name: me.name, role: me.role });
        setPermissions(me.permissions ?? []);
      } catch {
        if (cancelled) return;
        try {
          localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* storage unavailable — nothing to clear */
        }
        setUser(null);
        setPermissions([]);
        setReason('Session expired');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await api.login(email, password);
    try {
      localStorage.setItem(TOKEN_KEY, res.access_token);
    } catch {
      /* storage unavailable — session lasts for this tab only */
    }
    setUser(res.user);
    setReason(null);
    try {
      const me = await api.getMe();
      setPermissions(me.permissions ?? []);
      setUser({ id: me.id, email: me.email, name: me.name, role: me.role });
    } catch {
      setPermissions([]);
    }
  }, []);

  const clearReason = useCallback((): void => setReason(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, permissions, login, logout, loading, reason, clearReason }),
    [user, permissions, login, logout, loading, reason, clearReason]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

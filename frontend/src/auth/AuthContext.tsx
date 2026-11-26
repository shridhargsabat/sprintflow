import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { api, TOKEN_KEY, getToken, setAuthExpiredHandler } from '../api';
import type { AuthUser, MeResponse, Role } from '../api';

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
  /** True when session restore failed transiently (network/5xx): the stored
   * token is kept and the UI should offer a retry instead of a login form. */
  retrying: boolean;
  /** Re-run session restore after a transient failure. */
  retrySession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [reason, setReason] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);

  const logout = useCallback((logoutReason?: string): void => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable — nothing to clear */
    }
    setUser(null);
    setPermissions([]);
    setRetrying(false);
    if (logoutReason) setReason(logoutReason);
  }, []);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  // Any 401 from the API client ends the session with a "Session expired" reason.
  useEffect(() => {
    setAuthExpiredHandler(() => logoutRef.current('Session expired'));
    return () => setAuthExpiredHandler(null);
  }, []);

  // Restore session on mount. Only 401/403 (invalid, expired, or revoked
  // session) wipe the stored token; network failures and 5xx keep it and
  // surface a retrying state instead of forcing a logout (M7). A raw fetch
  // is used here (rather than api.getMe, which throws status-less Errors)
  // precisely so the status check below is possible.
  const bootRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let cancelled = false;
    const boot = async (): Promise<void> => {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const base: string = import.meta.env.VITE_API_URL || '/api';
        const res = await fetch(`${base}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* storage unavailable — nothing to clear */
          }
          setUser(null);
          setPermissions([]);
          setRetrying(false);
          setReason('Session expired');
        } else if (!res.ok) {
          // Transient server failure: keep the token for a later retry.
          setRetrying(true);
          setReason('Connection issue — retrying');
        } else {
          const me = (await res.json()) as MeResponse;
          if (cancelled) return;
          setUser({ id: me.id, email: me.email, name: me.name, role: me.role });
          setPermissions(me.permissions ?? []);
          setRetrying(false);
          setReason(null);
        }
      } catch {
        if (cancelled) return;
        // Network failure (or unparseable 200): keep the token for a retry.
        setRetrying(true);
        setReason('Connection issue — retrying');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    bootRef.current = boot;
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const retrySession = useCallback(async (): Promise<void> => {
    setLoading(true);
    await bootRef.current();
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
    setRetrying(false);
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
    () => ({ user, permissions, login, logout, loading, reason, clearReason, retrying, retrySession }),
    [user, permissions, login, logout, loading, reason, clearReason, retrying, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

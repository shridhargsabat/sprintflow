import { useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import type { Role } from '../api';

export interface Permissions {
  /** True when the signed-in user holds the given permission string. */
  can: (perm: string) => boolean;
  /** Current user's role, or null when unauthenticated. */
  role: Role | null;
}

/**
 * Permission gate hook for later per-button gating.
 * Reads the session from AuthProvider: { can(perm), role }.
 */
export function usePermissions(): Permissions {
  const { permissions, user } = useAuth();
  const can = useCallback((perm: string): boolean => permissions.includes(perm), [permissions]);
  return useMemo<Permissions>(
    () => ({ can, role: user ? user.role : null }),
    [can, user]
  );
}

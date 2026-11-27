import { useCallback, useEffect, useState } from 'react';
import type { ViewId } from '../types';

// Route table: hash fragment <-> view. View keys double as route slugs
// (#/dashboard, #/kanban, #/backlog). To add a view (e.g. 'reports' once a
// ReportsView lands), extend ViewId in types.ts and append its key here.
export const VIEW_IDS: ViewId[] = ['dashboard', 'kanban', 'backlog'];
export const DEFAULT_VIEW: ViewId = 'dashboard';

/** Map a location.hash to a view; empty/unknown hashes fall back to dashboard. */
export function parseHashView(hash: string): ViewId {
  const seg = hash
    .replace(/^#\/?/, '')
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
  return (VIEW_IDS as string[]).includes(seg) ? (seg as ViewId) : DEFAULT_VIEW;
}

/**
 * Bidirectional hash routing for the main views:
 * - initial mount reads the hash (deep link / refresh preserves the view),
 * - hashchange (back/forward, manual edit) updates the view,
 * - selectView(v) updates state AND the hash (one history entry per nav).
 * Empty/unknown hashes render the dashboard and are normalized in place
 * (replaceState, no extra history entry, never a blank screen).
 */
export function useHashRoute(): [ViewId, (v: ViewId) => void] {
  const [view, setView] = useState<ViewId>(() =>
    typeof window === 'undefined' ? DEFAULT_VIEW : parseHashView(window.location.hash)
  );

  useEffect(() => {
    // Canonicalize empty/unknown hashes without pushing history.
    // Runs on mount AND on every hashchange: in-page hash edits (manual
    // URL edits, back/forward to a stale hash) never re-mount, so the
    // handler must normalize too. replaceState fires no hashchange (no loop).
    const normalize = (): void => {
      const want = `#/${parseHashView(window.location.hash)}`;
      if (window.location.hash !== want) {
        window.history.replaceState(null, '', want);
      }
    };
    normalize();
    const onHashChange = (): void => {
      setView(parseHashView(window.location.hash));
      normalize();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const selectView = useCallback((v: ViewId) => {
    setView(v);
    const want = `#/${v}`;
    // Assignment pushes a history entry (back button walks views) and
    // fires hashchange, whose handler re-sets the same view (idempotent).
    if (typeof window !== 'undefined' && window.location.hash !== want) {
      window.location.hash = want;
    }
  }, []);

  return [view, selectView];
}

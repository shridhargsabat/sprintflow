/**
 * MOB-LOW-C/C1: warm the lazy BoardApp chunk (called on login submit) so it
 * fetches concurrently with the auth request instead of after it.
 * Vite/Rollup dedupes this dynamic import with App's lazy() into the same
 * chunk — no duplicate fetch. Kept in its own module to avoid an
 * App <-> LoginView import cycle.
 */
export function preloadBoardApp(): void {
  void import('./BoardApp');
}

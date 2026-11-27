import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import LoginView from './views/LoginView';

// MOB-LOW-C/C1: route-split — the authenticated app (Header, FilterBar,
// DashboardView, modals, useBoard) loads only after login, mirroring the
// existing Kanban/Backlog lazy pattern. Keeps the login chunk small so the
// client-rendered LCP text doesn't wait on ~500KB of unused JS.
const BoardApp = lazy(() => import('./BoardApp'));

function AppGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#f3f5fa] dark:bg-[#050814]">
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="lg-orb-a absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-sky-300/60 dark:bg-blue-600/25 blur-[110px]" />
          <div className="lg-orb-b absolute top-16 right-[-80px] w-[480px] h-[480px] rounded-full bg-violet-300/60 dark:bg-indigo-600/25 blur-[120px]" />
        </div>
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">Restoring session…</div>
      </div>
    );
  }

  if (!user) return <LoginView />;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-[#f3f5fa] dark:bg-[#050814]">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading workspace…</div>
        </div>
      }
    >
      <BoardApp />
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}

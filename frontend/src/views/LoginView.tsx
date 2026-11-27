import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { AlertCircle, Eye, EyeOff, Info, Layers, Loader2 } from 'lucide-react';
import { GLASS_PANEL } from '../constants';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api';
import { preloadBoardApp } from '../preloadBoardApp';

const DEMO_EMAIL = 'demo@sprintflow.local';
const DEMO_PASSWORD = 'Demo123!';

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown };
    if (typeof parsed.detail === 'string' && parsed.detail) return parsed.detail;
  } catch {
    /* not JSON — fall through */
  }
  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'Cannot reach the server. Is the backend running?';
  }
  return raw || 'Login failed. Please try again.';
}

export default function LoginView(): ReactElement {
  const { login, reason, clearReason } = useAuth();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [demoEnabled, setDemoEnabled] = useState<boolean>(false);
  const [demoBusy, setDemoBusy] = useState<boolean>(false);

  // Demo affordance is server-gated: 404 (flag off) means "demo disabled".
  useEffect(() => {
    api.getDemoStatus().then(s => setDemoEnabled(s.enabled)).catch(() => setDemoEnabled(false));
  }, []);

  const doLogin = async (loginEmail: string, loginPassword: string): Promise<void> => {
    // MOB-LOW-C/C1: warm the lazy BoardApp chunk so it fetches concurrently
    // with the auth request instead of after it (no post-login waterfall).
    preloadBoardApp();
    setError('');
    clearReason();
    await login(loginEmail.trim(), loginPassword);
  };

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await doLogin(email, password);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const onTryDemo = async (): Promise<void> => {
    if (busy || demoBusy) return;
    setDemoBusy(true);
    setError('');
    try {
      await api.resetDemo();
      await doLogin(DEMO_EMAIL, DEMO_PASSWORD);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDemoBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 text-slate-900 dark:text-slate-100"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter Variable", "Inter", sans-serif' }}
    >
      {/* Ambient Mesh Wallpaper (visible through the glass card) */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#f3f5fa] dark:bg-[#050814]">
        <div className="lg-orb-a absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-sky-300/60 dark:bg-blue-600/25 blur-[110px]" />
        <div className="lg-orb-b absolute top-16 right-[-80px] w-[480px] h-[480px] rounded-full bg-violet-300/60 dark:bg-indigo-600/25 blur-[120px]" />
        <div className="lg-orb-c absolute bottom-[-120px] left-1/3 w-[540px] h-[420px] rounded-full bg-rose-200/70 dark:bg-cyan-500/15 blur-[120px]" />
        <div className="lg-orb-d absolute top-1/2 -left-20 w-[340px] h-[340px] rounded-full bg-indigo-200/40 dark:bg-fuchsia-600/15 blur-[110px]" />
      </div>

      <div className={`lg-enter lg-modal-panel w-full max-w-md rounded-[32px] p-8 ${GLASS_PANEL}`}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.6)] shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">SprintFlow</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">Sign in to your workspace</p>
          </div>
        </div>

        {reason && (
          <div className="mb-4 rounded-2xl bg-amber-500/15 border border-amber-400/30 px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            <Info className="w-4 h-4 shrink-0" />
            <span>{reason}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-500/15 border border-rose-400/30 px-4 py-2.5 flex items-center gap-2 text-xs font-medium text-rose-700 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="field-text w-full rounded-2xl bg-white/70 dark:bg-white/10 border border-white/80 dark:border-white/15 px-4 py-2.5 text-base md:text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/30 transition"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field-text w-full rounded-2xl bg-white/70 dark:bg-white/10 border border-white/80 dark:border-white/15 px-4 py-2.5 pr-11 text-base md:text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/30 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-500/10 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="lg-press mt-1 w-full rounded-full bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white text-sm font-semibold py-2.5 px-5 min-h-[44px] md:min-h-0 flex items-center justify-center gap-2 shadow-[0_10px_28px_-8px_rgba(10,132,255,0.6),inset_0_1px_1px_rgba(255,255,255,0.45)] disabled:opacity-60 disabled:cursor-wait"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {demoEnabled && (
          <div className="mt-4 border-t border-slate-500/10 pt-4">
            <button type="button" disabled={busy || demoBusy} onClick={onTryDemo}
              className="lg-press w-full rounded-full text-sm font-semibold py-2.5 px-5 min-h-[44px] md:min-h-0 flex items-center justify-center gap-2 bg-white/60 dark:bg-white/10 border border-white/80 dark:border-white/15 backdrop-blur transition disabled:opacity-60 disabled:cursor-wait">
              {demoBusy && <Loader2 className="w-4 h-4 animate-spin" />}
              {demoBusy ? 'Preparing demo…' : 'Try the demo'}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500 dark:text-slate-400">Fresh sample workspace · resets on every demo login · local evaluation only</p>
          </div>
        )}
      </div>
    </div>
  );
}

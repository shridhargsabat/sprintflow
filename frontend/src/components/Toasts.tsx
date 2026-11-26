import { CheckCircle2 } from 'lucide-react';
import type { Toast } from '../types';

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`lg-toast px-4 py-2.5 rounded-full text-xs font-semibold backdrop-blur-2xl shadow-xl border flex items-center gap-2 ${t.type === 'success' ? 'bg-emerald-500/85 border-emerald-300/50 text-white' : t.type === 'error' ? 'bg-rose-500/85 border-rose-300/50 text-white' : 'bg-slate-900/80 border-white/20 text-white'}`}>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

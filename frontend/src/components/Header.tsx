import type * as React from 'react';
import type { RefObject } from 'react';
import {
  Database,
  Download,
  Kanban,
  Layers,
  LayoutGrid,
  ListChecks,
  Moon,
  MoreVertical,
  Plus,
  RotateCcw,
  Sun,
  Upload,
  Users,
} from 'lucide-react';
import { GLASS_PANEL, GLASS_PILL } from '../constants';
import { GlassTooltip } from './GlassTooltip';
import { useEscapeKey } from '../hooks/useEscapeKey';
import type { ViewId } from '../types';

export interface HeaderProps {
  activeView: ViewId;
  onSelectView: (v: ViewId) => void;
  darkMode: boolean;
  onToggleDark: () => void;
  menuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onOpenTeam: () => void;
  onNewTask: () => void;
  onExportJson: () => void;
  onResetDemo: () => void;
  onImportJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export default function Header({
  activeView,
  onSelectView,
  darkMode,
  onToggleDark,
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  onOpenTeam,
  onNewTask,
  onExportJson,
  onResetDemo,
  onImportJson,
  fileInputRef,
}: HeaderProps) {
  useEscapeKey(onCloseMenu, menuOpen);
  return (
    <>
      {/* Ambient Mesh Wallpaper */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden bg-[#f3f5fa] dark:bg-[#050814] transition-colors duration-500">
        <div className="lg-orb-a absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-sky-300/60 dark:bg-blue-600/25 blur-[110px]" />
        <div className="lg-orb-b absolute top-16 right-[-80px] w-[480px] h-[480px] rounded-full bg-violet-300/60 dark:bg-indigo-600/25 blur-[120px]" />
        <div className="lg-orb-c absolute bottom-[-120px] left-1/3 w-[540px] h-[420px] rounded-full bg-rose-200/70 dark:bg-cyan-500/15 blur-[120px]" />
        <div className="lg-orb-d absolute top-1/2 -left-20 w-[340px] h-[340px] rounded-full bg-indigo-200/40 dark:bg-fuchsia-600/15 blur-[110px]" />
      </div>

      {/* Floating Header */}
      <div className="sticky top-0 z-30 pt-3 px-4 sm:px-6">
        <header className={`lg-enter max-w-[1440px] mx-auto rounded-full px-4 sm:px-5 h-16 flex items-center justify-between gap-3 ${GLASS_PANEL}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-[0_6px_20px_-4px_rgba(37,99,235,0.55),inset_0_1px_1px_rgba(255,255,255,0.6)] shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold tracking-tight truncate">SprintFlow</h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-400/30">
                  <Database className="w-3 h-3" /> SQLite Live
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate hidden md:block">
                Sprint Dashboard, Kanban &amp; Backlog
              </p>
            </div>
          </div>

          <nav aria-label="Main views" className="flex items-center bg-slate-900/[0.05] dark:bg-white/[0.06] p-1 rounded-full border border-white/60 dark:border-white/10">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
              { id: 'kanban', label: 'Kanban', icon: Kanban },
              { id: 'backlog', label: 'Backlog & Schedule', short: 'Backlog', icon: ListChecks }
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onSelectView(tab.id as ViewId)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm transition-all duration-200 ${
                    active
                      ? 'font-semibold bg-white/90 dark:bg-white/20 text-blue-600 dark:text-white shadow-sm'
                      : 'font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.short ? (
                    <>
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.short}</span>
                    </>
                  ) : (
                    <span>{tab.label}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <GlassTooltip label="Manage team" position="bottom" className="hidden sm:inline-flex">
              <button
                type="button"
                onClick={() => onOpenTeam()}
                className={`hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium ${GLASS_PILL}`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Team</span>
              </button>
            </GlassTooltip>

            <div className="relative">
              <GlassTooltip label="Data options: export, import, reset" position="bottom">
                <button
                  type="button"
                  onClick={() => onOpenMenu()}
                  aria-label="Data options"
                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${GLASS_PILL}`}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </GlassTooltip>
              {menuOpen && (
                <div className={`lg-dropdown lg-refract absolute right-0 mt-2.5 w-52 rounded-3xl py-2 z-40 ${GLASS_PANEL}`}>
                  <button type="button" onClick={() => { onCloseMenu(); onOpenTeam(); }} className="sm:hidden w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                    <Users className="w-3.5 h-3.5" /> Manage Team
                  </button>
                  <button type="button" onClick={onExportJson} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                    <Download className="w-3.5 h-3.5" /> Export JSON
                  </button>
                  <button type="button" onClick={() => fileInputRef.current && fileInputRef.current.click()} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 flex items-center gap-2.5">
                    <Upload className="w-3.5 h-3.5" /> Import JSON
                  </button>
                  <div className="my-1.5 mx-3 border-t border-slate-900/10 dark:border-white/10" />
                  <button type="button" onClick={onResetDemo} className="w-full px-4 py-2 text-left text-xs font-medium hover:bg-rose-500/10 flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
                    <RotateCcw className="w-3.5 h-3.5" /> Reset SQLite Data
                  </button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".json" onChange={onImportJson} className="hidden" />
            </div>

            <GlassTooltip label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} position="bottom">
              <button type="button" onClick={() => onToggleDark()} aria-label="Toggle dark mode" className={`inline-flex items-center justify-center w-9 h-9 rounded-full ${GLASS_PILL}`}>
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </GlassTooltip>

            <button
              type="button"
              onClick={() => onNewTask()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold bg-gradient-to-b from-[#0a84ff] to-[#0066dc] text-white shadow-[0_6px_20px_-4px_rgba(0,122,255,0.55),inset_0_1px_0_rgba(255,255,255,0.45)]"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </header>
      </div>
    </>
  );
}

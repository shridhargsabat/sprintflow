# SprintFlow Mobile-Friendliness Audit

- **Date:** 2026-11-27 · **App:** https://sprintflow.ai-automation-hub.tech
- **Method:** 3 parallel Playwright (local Chromium) agents on live prod at 390×844 + 768×1024, measuring `scrollWidth` vs viewport, element rects, computed font sizes, and touch-target boxes; plus a 360×800 pass and a Lighthouse mobile run on the public login page.
- **Status note:** this audit ran BEFORE the M1/M2/M3 responsive fixes (PRs #13–#15, all merged). Each finding is marked with its fix status. Post-fix spot-checks (360px pass, this file's screenshots) confirm zero page-level overflow.

## Pass/fail per screen (at audit time → now)

| Screen | 360/390 verdict | Notes |
|---|---|---|
| Login | PASS → PASS | Fits, no overflow; inputs were 14px (iOS auto-zoom risk) → FIXED to 16px (M3) |
| App shell / header | **FAIL → FIXED** | Action cluster ran to x=534 (Add + theme toggle off-screen, brand crushed); at 768 New Task clipped 47px → responsive header (M1) |
| Kanban board | PASS → PASS | 1-up stacking, cards fit; DnD dead on touch but per-card Move-to fallback exists |
| Backlog list | **FAIL → FIXED** | 760px+ table, actions ~470px off-viewport with no affordance → card layout under md (M2) |
| Task create/edit modal | PASS → PASS | Fits with margins; inputs <16px → FIXED (M3); calendar cells 39×32 → 44px class (M3) |
| Task detail modal | PASS → PASS | Action row wrapped awkwardly → stacks full-width (M3); "Due Dec 6 Dec 6" duplication → FIXED (M3) |
| Team modal | **FAIL → FIXED** | Add button clipped (370px row in 308px column) → stacks on phones (M3) |
| Tags / Users modals | PASS → PASS | Fit; Users fieldset bled 3px → `min-w-0` (M3); both gained max-height scroll (M3) |
| Dashboard widgets | PASS → PASS | Hero, KPI 4-up, donut, burndown, rows all readable; two header links wrap to 2 lines (cosmetic, open) |
| Touch targets (global) | **FAIL → FIXED** | Widespread sub-44px (pills 28, icons 26–36, buttons 28–40, swatches 20) → raised toward 44px below md (M1/M3) |

## Overflow measurements

Pre-fix: zero page-level overflow in every state (the header defect was *masked* by `overflow-x-hidden` — P-301 trap — with content to x=534). Post-fix 360×800: kanban 360≤360, backlog 360≤360.

## Lighthouse mobile (public login page)

`lighthouse-login.json` — Performance **79**, Accessibility **98**, Best Practices **100**, SEO **82**. FCP 1.1s, LCP 5.2s (drag on perf score), TBT 150ms, CLS 0, SI 1.1s. Authenticated screens are not Lighthouse-scorable without scripted login; they were covered by the Playwright checks above instead.

## Screenshots

`screenshots/`: `360-login/kanban/backlog.png`, `390-login/kanban/backlog/task-create/task-detail/calendar/team-modal.png`. Full evidence (40+ shots, rect JSON) lives in the agent scratch dirs and is ephemeral — these copies are the permanent record.

## Open (LOW, not scheduled)

- Dashboard "Rename Team" / "Full Backlog" links wrap at 390 (cosmetic).
- Details modal lacks `role="dialog"` (a11y nit).
- Assignee multi-menu covers Due Date field until dismissed.
- Empty board stacks 5 min-280px columns (~1500px scroll of "Drop task here").
- LCP 5.2s on throttled mobile — font/bundle tuning if perf score must rise.
